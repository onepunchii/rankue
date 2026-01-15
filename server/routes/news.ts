import { Router } from "express";
import { storage } from "../storage.js";
import { syncNews } from "../services/newsService.js";
import { searchNews, crawlNewsContent, analyzeNews } from "../newsAnalyzer.js";
import { type NewsArticle } from "../../shared/schema.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();

// 2. News Routes
router.post("/sync", async (req, res) => {
    try {
        await syncNews();
        sendSuccess(res, { success: true });
    } catch (error) {
        sendError(res, 500, "News sync failed");
    }
});

router.get("/", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const category = req.query.category as string || '전체';
        const searchQuery = (req.query.query || req.query.q) as string;

        let articles: NewsArticle[] = [];

        if (category === '기타') {
            const otherCategories = ['생활/문화', 'IT/과학', '세계'];
            const results = await Promise.all(otherCategories.map(c => storage.getLatestNewsArticles(20, c, searchQuery)));
            articles = results.flat().sort((a, b) => {
                const dateA = a.publishedAt?.getTime() || a.createdAt?.getTime() || 0;
                const dateB = b.publishedAt?.getTime() || b.createdAt?.getTime() || 0;
                return dateB - dateA;
            }).slice(0, limit);
        } else if (category === '토론') {
            const allLatest = await storage.getLatestNewsArticles(100, undefined, searchQuery);
            articles = allLatest.filter(a => !!a.mindTranslation).slice(0, limit);
        } else {
            articles = await storage.getLatestNewsArticles(limit, category, searchQuery);
        }

        // DB에 데이터가 없고 검색어가 없다면 자동 동기화
        if (articles.length === 0 && !searchQuery) {
            console.log(`[API] No news in DB for category: ${category}, triggering global sync...`);
            await syncNews();
            articles = await (category === '전체'
                ? storage.getLatestNewsArticles(limit, '전체')
                : storage.getLatestNewsArticles(limit, category));
        }

        // 프런트엔드 호환성을 위한 포매팅
        const formattedNews = articles.map(article => {
            const isJunkContent = article.content?.includes('* [언론사별]') || article.content?.includes('## 이슈 NOW');
            return {
                id: article.url,
                title: article.title,
                link: article.url,
                description: isJunkContent ? "" : (article.content || ""),
                pubDate: article.publishedAt?.toISOString() || article.createdAt?.toISOString(),
                imageUrl: article.imageUrl,
                category: article.category,
                provider: '네이버 뉴스',
                hasAnalysis: !!article.mindTranslation,
                mindTranslation: article.mindTranslation
            };
        });

        sendSuccess(res, formattedNews);
    } catch (error) {
        console.error("News fetch error:", error);
        sendError(res, 500, "Failed to fetch news");
    }
});

router.get("/analysis", async (req, res) => {
    try {
        const url = req.query.url as string;
        if (!url) return sendError(res, 400, "URL is required");
        const analysis = await storage.getNewsAnalysis(url);
        return sendSuccess(res, analysis);
    } catch (error) {
        return sendError(res, 500, "Failed to fetch news analysis");
    }
});

router.post("/content", async (req, res) => {
    const { url } = req.body;
    if (!url) return sendError(res, 400, "URL required", "INVALID_INPUT");

    try {
        const cached = await storage.getNewsAnalysis(url).catch(e => null);
        if (cached?.content && cached.content.length > 300) {
            return sendSuccess(res, { content: cached.content });
        }

        const content = await crawlNewsContent(url);
        if (content) {
            try {
                await storage.saveNewsAnalysis({ url, content, title: "" });
            } catch (dbError) {
                console.warn("⚠️ News DB Storage Warning:", dbError);
            }
        }
        return sendSuccess(res, { content });
    } catch (error) {
        console.error("Content Error:", error);
        return sendError(res, 500, "Failed to load content");
    }
});

router.post("/analyze", async (req, res) => {
    const { url } = req.body;
    if (!url) return sendError(res, 400, "URL required", "INVALID_INPUT");

    try {
        const cached = await storage.getNewsAnalysis(url).catch(e => null);
        if (cached?.mindTranslation) return sendSuccess(res, cached.mindTranslation);

        const result = await analyzeNews(url, cached?.content);
        if (!result) return sendError(res, 500, "Analysis failed");

        try {
            await storage.saveNewsAnalysis({
                url,
                content: result.content,
                mindTranslation: result,
            });
        } catch (dbError) {
            console.warn("⚠️ DB Analysis Storage Warning:", dbError);
        }

        return sendSuccess(res, result);
    } catch (error) {
        console.error("Analysis Error:", error);
        return sendError(res, 500, "AI Analysis failed");
    }
});

export default router;
