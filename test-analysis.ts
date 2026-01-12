
import 'dotenv/config'; // Load .env
import { analyzeNews } from './server/newsAnalyzer';

async function runAnalysisTest() {
    const targetUrl = "https://n.news.naver.com/mnews/article/421/0008706821?sid=102";
    console.log("🧠 [AI 분석 테스트 시작]");
    console.log(`🔗 Target: ${targetUrl}`);

    // Check API Key
    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ [설정 오류] OPENAI_API_KEY가 환경 변수에 없습니다.");
        process.exit(1);
    }
    console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY.substring(0, 5)}... (Length: ${process.env.OPENAI_API_KEY.length})`);

    try {
        const result = await analyzeNews(targetUrl);

        if (!result) {
            console.error("❌ [실패] 분석 결과가 null입니다. (OpenAI API 호출 실패 또는 파싱 에러)");
        } else {
            console.log("\n✅ [성공] AI 분석 완료! (JSON 응답 확인)");
            console.log("-----------------------------------------");
            console.log("🕵️‍♂️ 속뜻:", result.hidden_intent);
            console.log("⚖️ 팩트:", result.fact_check);
            console.log("📝 한줄:", result.one_liner);
            console.log("-----------------------------------------");
        }
    } catch (error: any) {
        console.error("\n❌ [에러 발생]", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        }
    }
}

runAnalysisTest();
