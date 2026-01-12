
import 'dotenv/config';
import { crawlNewsContent } from './server/newsAnalyzer';

async function runCrawlTest() {
    const targetUrl = "https://n.news.naver.com/mnews/article/421/0008706821?sid=102";
    console.log("🕷️ [크롤러 테스트 시작]");
    console.log(`🔗 Target URL: ${targetUrl}`);

    try {
        const content = await crawlNewsContent(targetUrl);
        console.log("---------------------------------------------------");
        console.log(`📝 추출된 본문 길이: ${content?.length || 0} 자`);
        console.log("---------------------------------------------------");

        if (!content || content.length < 100) {
            console.error("❌ [실패] 본문 내용이 너무 짧거나 없습니다. 크롤러가 내용을 찾지 못했습니다.");
            console.log("내용 미리보기:", content);
        } else {
            console.log("✅ [성공] 본문을 성공적으로 추출했습니다!");
            console.log("내용 미리보기 (첫 200자):");
            console.log(content.substring(0, 200) + "...");
        }
    } catch (error) {
        console.error("❌ [에러 발생]", error);
    }
}

runCrawlTest();
