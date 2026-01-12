import { crawlNaverHeadlines, searchNews } from "../newsAnalyzer";
import { storage } from "../storage";

export async function syncNews() {
    console.log("🔄 Starting headline news synchronization...");

    // 네이버 섹션 ID 매핑
    const sectionConfig = [
        { id: '100', name: '정치' },
        { id: '101', name: '경제' },
        { id: '102', name: '사회' },
        { id: '103', name: '생활/문화' }, // 추가
        { id: '104', name: '세계' }, // 추가
        { id: '105', name: 'IT/과학' },
        { id: 'ranking', name: '랭킹' } // 추가
    ];

    let totalSaved = 0;

    try {
        for (const section of sectionConfig) {
            console.log(`[NewsService] Crawling headlines for: ${section.name} (Section: ${section.id})`);

            // 1. 직접 섹션 페이지 크롤링 시도 (헤드라인 중심)
            let items = await crawlNaverHeadlines(section.id);

            // 2. 크롤링 결과가 없으면 검색 API로 폴백
            if (items.length === 0) {
                console.warn(`[NewsService] Crawling failed for ${section.name}, falling back to Search API`);
                items = await searchNews(section.name);
            }

            let topArticleUrl: string | null = null;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                try {
                    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
                    const url = item.link || item.originallink;

                    await storage.saveNewsArticle({
                        title: item.title.replace(/<\/?[^>]+(>|$)/g, ""),
                        url: url,
                        publishedAt: pubDate,
                        category: section.name,
                        content: item.description.replace(/<\/?[^>]+(>|$)/g, ""),
                        imageUrl: null,
                    });

                    if (i === 0) topArticleUrl = url;
                    totalSaved++;
                } catch (articleError) {
                    console.error(`[NewsService] Error saving article: ${item.link}`, articleError);
                }
            }

            // [Auto Survey] 섹션별로 가장 상단 기사 하나를 뽑아 설문지 자동 생성 시도
            if (topArticleUrl) {
                const { generateAutoSurvey } = await import("./autoSurveyService");
                // 백그라운드에서 실행 (동기화 속도에 영향을 주지 않도록)
                generateAutoSurvey(topArticleUrl).catch(e => console.error(`[NewsService] Auto survey generation failed for ${section.name}:`, e));
            }
        }
        console.log(`✅ Headline sync completed. Total articles processed: ${totalSaved}`);
    } catch (error) {
        console.error("❌ News headline sync failed:", error);
    }
}
