import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Brain, Quote, Target, ChevronLeft, ExternalLink, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MobileHeader from "@/components/mobile-header";
import { Badge } from "@/components/ui/badge";

interface NewsArticle {
    id: string;
    title: string;
    link: string;
    pubDate: string;
    provider: string;
    category: string;
    description?: string;
    imageUrl?: string;
    originallink?: string;
    content?: string;
    mind_translation?: any;
}

interface NewsAnalysisResult {
    hidden_intent: string;
    fact_check: string;
    one_liner: string;
    content?: string;
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

export default function NewsViewer() {
    const [location, setLocation] = useLocation();
    const { toast } = useToast();

    const searchString = useSearch();
    const searchParams = new URLSearchParams(searchString);
    const articleUrl = searchParams.get('url');
    const articleId = searchParams.get('id');

    const [content, setContent] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<NewsAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);

    // Article Metadata State
    const [articleTitle, setArticleTitle] = useState<string>("");
    const [articleProvider, setArticleProvider] = useState<string>("");
    const [articleDate, setArticleDate] = useState<string>("");

    const { data: newsArticles = [] } = useQuery<NewsArticle[]>({
        queryKey: ["/api/news"],
        staleTime: 6 * 60 * 60 * 1000,
    });

    const nextArticles = newsArticles
        .filter(a => {
            if (articleId) {
                return a.id !== articleId;
            }
            return (a.link || a.originallink) !== articleUrl;
        })
        .slice(0, 5);

    useEffect(() => {
        // Only run validation if we are actually on the view page
        if (location !== '/news/view') return;

        if (!articleUrl && !articleId) {
            // Silently redirect if invalid, no toast needed as it might be a navigation artifact
            const from = searchParams.get('from');
            setLocation(from || '/');
            return;
        }

        // ID로 기사 찾기 또는 URL로 찾기
        const cachedArticle = articleId
            ? newsArticles.find(a => a.id === articleId)
            : newsArticles.find(a => (a.link === articleUrl || a.originallink === articleUrl));

        // 메타 데이터 설정
        if (cachedArticle) {
            setArticleTitle(cachedArticle.title);
            setArticleProvider(cachedArticle.provider);
            setArticleDate(cachedArticle.pubDate);
        }

        // 캐시 데이터가 유효하고 내용이 적절한지 확인 (300자 미만이면 스니펫일 가능성이 높음)
        const isJunkContent = cachedArticle?.content?.includes("기사 섹션 분류 안내") || (cachedArticle?.content?.length || 0) < 300;

        if (cachedArticle && cachedArticle.mind_translation && cachedArticle.content && !isJunkContent) {
            console.log("Using pre-analyzed news data from cache");

            let trans = cachedArticle.mind_translation;
            if (typeof trans === 'string') {
                try { trans = JSON.parse(trans); } catch (e) { trans = {}; }
            }

            // 지능형 키 매핑 (한글/영문/유사 키 지원)
            const findValue = (obj: any, keywords: string[]) => {
                const keys = Object.keys(obj);
                for (const keyword of keywords) {
                    const foundKey = keys.find(k => k.toLowerCase().includes(keyword.toLowerCase()));
                    if (foundKey) return obj[foundKey];
                }
                return null;
            };

            const hiddenIntent = findValue(trans, ["hidden", "의도", "속뜻", "intent"]) || "숨겨진 의도를 분석할 수 없습니다.";
            const oneLiner = findValue(trans, ["translation", "요약", "표면", "one_liner"]) || "내용 요약을 불러올 수 없습니다.";
            const factCheck = findValue(trans, ["fact", "팩트", "진위"]) || "팩트 체크 정보가 없습니다.";

            setContent(cachedArticle.content);
            setAnalysisResult({
                hidden_intent: hiddenIntent,
                fact_check: factCheck,
                one_liner: oneLiner,
                content: cachedArticle.content
            });
            setIsLoadingContent(false);
            setIsAnalyzing(false);
            return;
        }

        const fetchContentAndAnalyze = async () => {
            setIsLoadingContent(true);
            setIsAnalyzing(true);
            setContent(null);
            setAnalysisResult(null);

            try {
                const contentResponse = await fetch('/api/news/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: articleUrl })
                });

                if (contentResponse.ok) {
                    const json = await contentResponse.json();
                    const contentData = json.success ? json.data : json;
                    setContent(contentData.content);
                }
            } catch (error) {
                console.error("News content fetch failed", error);
            } finally {
                setIsLoadingContent(false);
            }

            try {
                const response = await fetch('/api/news/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: articleUrl })
                });

                if (response.ok) {
                    const json = await response.json();
                    const data = json.success ? json.data : json;
                    setAnalysisResult(data);
                    if (data.content) setContent(data.content);
                }
            } catch (error) {
                console.error("News analysis failed", error);
            } finally {
                setIsAnalyzing(false);
            }
        };

        // URL이 있을 때만 fetch 실행 (캐시된 데이터가 불완전하면 API로 가져옴)
        const isDataIncomplete = !cachedArticle || !cachedArticle.content || !cachedArticle.mind_translation;
        if (articleUrl && isDataIncomplete) {
            fetchContentAndAnalyze();
        }
    }, [articleUrl, articleId, setLocation, toast, newsArticles]);

    const handleNextArticle = (url: string) => {
        window.scrollTo(0, 0);
        setLocation(`/news/view?url=${encodeURIComponent(url)}`);
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

    return (
        <div className="min-h-screen bg-[#121212] pb-20">
            <MobileHeader />

            <div className="sticky top-14 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex justify-between items-center">
                <Button variant="ghost" size="sm" onClick={() => {
                    const from = searchParams.get('from');
                    setLocation(from || '/');
                }} className="text-gray-400 hover:text-white -ml-2">
                    <ChevronLeft className="w-5 h-5 mr-1" /> {searchParams.get('from') === '/news' ? '목록으로' : '홈으로'}
                </Button>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white"><Share2 className="w-5 h-5" /></Button>
                    {articleUrl && (
                        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => window.open(articleUrl, '_blank')}>
                            <ExternalLink className="w-5 h-5" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6">
                {isLoadingContent ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="relative w-20 h-20 mb-8">
                            <div className="absolute inset-0 border-4 border-purple-500/20 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                            <Brain className="absolute inset-0 m-auto w-8 h-8 text-purple-400 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold text-white">기사 원문을 불러오는 중...</h3>
                    </div>
                ) : content ? (
                    <div className="py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Article Header */}
                        <header className="mb-8 border-b border-white/10 pb-6">
                            <div className="flex items-center gap-2 mb-3">
                                {articleProvider && <Badge variant="outline" className="text-[10px] text-gray-400 border-white/10 px-2 py-0.5 font-normal">{articleProvider}</Badge>}
                                {articleDate && <span className="text-[10px] text-gray-500">{new Date(articleDate).toLocaleDateString()}</span>}
                            </div>
                            <h1 className="text-xl md:text-2xl font-black text-white leading-tight">
                                {cleanText(articleTitle)}
                            </h1>
                        </header>

                        <article className="mb-12">
                            <div className="prose prose-invert prose-lg max-w-none leading-relaxed">
                                {content.split('\n').map((paragraph, idx) => {
                                    // 빈 줄 제거
                                    if (!paragraph.trim()) return null;

                                    // [앵커], [기자] 등의 화자 표시를 강조
                                    const isSpeaker = /^\[.+?\]/.test(paragraph.trim());

                                    return (
                                        <p
                                            key={idx}
                                            className={`mb-4 text-gray-300 ${isSpeaker ? 'font-bold text-purple-400 mt-6' : ''}`}
                                        >
                                            {paragraph}
                                        </p>
                                    );
                                })}
                            </div>
                        </article>

                        {isAnalyzing ? (
                            <div className="rounded-3xl bg-[#1a1a1a] border border-white/10 p-8 mb-12 text-center animate-pulse">
                                <h3 className="text-lg font-bold text-white mb-2">AI가 행간을 분석하고 있습니다...</h3>
                            </div>
                        ) : analysisResult ? (
                            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1a1a] to-black border border-purple-500/30 p-6 sm:p-8 mb-12 shadow-2xl">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
                                        <Brain className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <h3 className="text-xl font-black text-white italic">Polli Insight</h3>
                                </div>
                                <div className="space-y-6">
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                                        <h4 className="text-xs font-black text-purple-400 uppercase mb-3 flex items-center gap-2"><Quote className="w-3 h-3" /> 진짜 속뜻</h4>
                                        <p className="text-base text-white/90 leading-relaxed font-medium">{analysisResult.hidden_intent}</p>
                                    </div>
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                                        <h4 className="text-xs font-black text-amber-400 uppercase mb-3 flex items-center gap-2"><Target className="w-3 h-3" /> 팩트 vs 뇌피셜</h4>
                                        <p className="text-sm text-white/70 leading-relaxed">{analysisResult.fact_check}</p>
                                    </div>
                                    <div className="p-5 rounded-2xl bg-purple-900/10 border border-purple-500/20 text-center">
                                        <h4 className="text-[10px] font-black text-purple-300 uppercase mb-2">한 줄 요약</h4>
                                        <p className="text-lg font-black text-white italic">"{analysisResult.one_liner}"</p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="pt-8 border-t border-white/10">
                            <h3 className="text-lg font-bold text-white mb-4">이어서 볼만한 뉴스</h3>
                            <div className="space-y-3">
                                {nextArticles.map((article, index) => (
                                    <div key={index} onClick={() => handleNextArticle(article.link || article.originallink || "")} className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer flex justify-between items-center group">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge className={`text-[10px] px-1.5 py-0 ${getCategoryColor(article.category)}`}>{article.category}</Badge>
                                                <span className="text-[10px] text-gray-500">{article.provider}</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-white line-clamp-2" dangerouslySetInnerHTML={{ __html: article.title }}></h4>
                                        </div>
                                        <ChevronLeft className="w-5 h-5 rotate-180 text-gray-500 group-hover:text-white" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
