import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import GuestRestrictionModal from "./GuestRestrictionModal";

import {
  Brain,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from "lucide-react";

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  provider: string;
  category: string;
  description?: string;
  imageUrl?: string;
  image?: string;
  pollId?: number;
  originallink?: string;
  content?: string;
  mind_translation?: {
    hidden_intent: string;
    translation: string;
    fact_check: string;
  };
}

export default function NewsCarousel({ category }: { category?: string }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);

  const [, setLocation] = useLocation();

  const { data: newsArticles = [], isLoading, error } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news", category],
    queryFn: async () => {
      console.log(`[NewsCarousel] Fetching news for category: ${category || 'all'}...`);
      const url = new URL("/api/news", window.location.origin);
      if (category) url.searchParams.append("category", category);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Network response was not ok");
      const json = await res.json();
      console.log("[NewsCarousel] News fetched:", json);
      // Backend sendSuccess wraps data in { success: true, data: [...] }
      return Array.isArray(json.data) ? json.data : [];
    },
    refetchInterval: 6 * 60 * 60 * 1000,
    staleTime: 5 * 60 * 1000, // Reasonable stale time
  });

  console.log("[NewsCarousel] Render state:", { isLoading, hasData: newsArticles.length, error });

  // Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    const x = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // 뉴스 속마음 분석 핸들러 (사용자 요청에 따라 항상 페이지 이동)
  const handleAnalyzeNews = (article: NewsArticle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const url = article.link || article.originallink;
    const encodedUrl = encodeURIComponent(url || '');
    setLocation(`/news/view?url=${encodedUrl}&from=/`);
  };

  const scrollToLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollToRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case '정치': return 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400';
      case '경제': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
      case '연예': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
      case '스포츠': return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
      case '사회': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const formatTimeAgo = (pubDate: string) => {
    if (!pubDate) return '';
    const now = new Date();
    const articleDate = new Date(pubDate);
    const diffMs = now.getTime() - articleDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) {
      return `${diffMins}분 전`;
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else {
      return articleDate.toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  if (isLoading) {
    return (
      <section className="px-4 py-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">실시간 뉴스</h2>
          <div className="animate-pulse w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="flex space-x-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-72 h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      </section>
    );
  }

  if (!newsArticles.length) {
    return null;
  }

  return (
    <section className="px-4 py-6 mb-8 mt-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-30"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
            </span>
            실시간 뉴스
          </h2>
          <div className="hidden sm:flex items-center space-x-1.5 text-[10px] font-bold text-white/40 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>AI 번역기 연동</span>
          </div>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/news')}
            className="text-[11px] font-bold px-3 py-1 h-8 text-white/40 hover:text-white bg-white/5 border border-white/5 hover:border-white/10 rounded-full transition-all"
          >
            모두보기
          </Button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="flex space-x-4 overflow-x-auto cursor-grab active:cursor-grabbing scrollbar-hide pb-4"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {newsArticles.map((article) => (
            <Card
              key={article.id}
              className="flex-shrink-0 w-[300px] glass-card border-white/10 bg-white/5 backdrop-blur-xl group cursor-pointer hover:bg-white/[0.08] transition-all duration-500 rounded-3xl overflow-hidden"
              onClick={(e) => handleAnalyzeNews(article, e as any)}
            >
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 font-bold border-0 bg-white/5 ${getCategoryColor(article.category).split(' ').pop()}`}
                  >
                    {article.category}
                  </Badge>
                  <div className="flex items-center gap-1.5 opacity-40">
                    <span className="text-[10px] font-bold text-white uppercase tracking-tight">
                      {article.provider}
                    </span>
                    <span className="text-[10px] text-white/30">•</span>
                    <span className="text-[10px] font-medium text-white/60">
                      {formatTimeAgo(article.pubDate)}
                    </span>
                  </div>
                </div>

                <h3
                  className="font-bold text-white text-base leading-snug mb-3 line-clamp-2 group-hover:text-purple-300 transition-colors"
                  dangerouslySetInnerHTML={{ __html: article.title }}
                ></h3>

                <p
                  className="text-xs text-white/30 leading-relaxed line-clamp-2 mb-6"
                  dangerouslySetInnerHTML={{ __html: article.description || '' }}
                ></p>

                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] font-bold text-white/20 hover:text-white/60 p-0 h-auto transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(article.originallink || article.link, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    원문 보기
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-purple-400 hover:text-purple-300 text-[11px] font-black p-0 h-auto transition-all group/btn"
                    onClick={(e) => handleAnalyzeNews(article, e as any)}
                  >
                    <Brain className="w-4 h-4 mr-1.5 group-hover/btn:scale-110 transition-transform" />
                    속마음 보기
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <GuestRestrictionModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        feature="뉴스 속마음 분석"
        description="뉴스 속마음 분석은 회원만 사용할 수 있습니다. 회원가입하고 AI의 날카로운 분석을 확인해보세요!"
      />
    </section>
  );
}