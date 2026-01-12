
import 'dotenv/config'; // Load env vars
import { db } from "./server/db";
import { newsArticles } from "./shared/schema";
import { eq } from "drizzle-orm";

async function runTest() {
    console.log("\n🧪 [테스트 시작] Supabase DB 연결 및 데이터 삽입 테스트");
    console.log("---------------------------------------------------");

    const testUrl = `https://test-news.com/article/${Date.now()}`;
    const mockArticle = {
        title: "TEST: Supabase 연결 확인용 테스트 기사",
        url: testUrl,
        content: "이 데이터가 Supabase의 news_articles 테이블에 저장된다면 DB 연동은 성공적입니다.",
        category: "테스트",
        publishedAt: new Date(),
        mindTranslation: {
            hidden_intent: "테스트 의도",
            fact_check: "테스트 팩트",
            one_liner: "테스트 요약"
        }
    };

    try {
        console.log(`📝 데이터 삽입 시도: ${mockArticle.title}`);
        console.log(`🔗 Target URL: ${testUrl}`);

        // 1. Insert 시도
        await db.insert(newsArticles).values(mockArticle);
        console.log("✅ [성공] 데이터가 문제없이 전송(Insert)되었습니다.");

        // 2. Select 시도 (검증)
        console.log("🔎 [검증] 방금 넣은 데이터를 다시 조회합니다...");
        const result = await db.select().from(newsArticles).where(eq(newsArticles.url, testUrl));

        if (result.length > 0) {
            console.log("🎉 [최종 확인] 데이터 조회 성공! Supabase와 정상적으로 연동되고 있습니다.");
            console.log("📄 조회된 데이터:", result[0]);
        } else {
            console.error("❌ [실패] Insert는 에러 없이 넘어가는데 조회되지 않습니다. (트랜잭션/커밋 문제 가능성)");
        }

    } catch (error: any) {
        console.error("\n❌ [치명적 에러] DB 작업이 실패했습니다.");
        console.error("---------------------------------------------------");
        console.error("에러 메시지:", error.message);
        if (error.code) console.error("에러 코드:", error.code);
        if (error.routine) console.error("관련 루틴:", error.routine);
        console.error("---------------------------------------------------");
        console.error("💡 분석: 이 에러가 발생했다면 news_articles 테이블이 없거나, 스키마가 일치하지 않는 것입니다.");
        console.error("-> 해결책: 터미널에서 멈춰있는 'npm run db:push'를 재실행하여 테이블을 생성해야 합니다.");
    } finally {
        process.exit();
    }
}

runTest();
