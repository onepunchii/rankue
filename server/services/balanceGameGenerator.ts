import OpenAI from "openai";
import { storage } from "../storage.js";
import { crawlNewsContent } from "../newsAnalyzer.js";

// Ensure OpenAI client is initialized (reusing key check logic locally or importing if exposed, but simple re-init is fine)
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: apiKey || "dummy" });

export async function generateBalanceGameFromNews(url: string) {
    if (!apiKey) {
        console.warn("[BalanceGame] No OpenAI Key, skipping generation.");
        return;
    }

    try {
        console.log(`[BalanceGame] Generating game from: ${url}`);

        // 1. Crawl Content
        const contentStr = await crawlNewsContent(url);
        if (!contentStr || contentStr.length < 200) {
            console.log("[BalanceGame] Content too short or empty.");
            return;
        }

        // 2. Prompt GPT
        const prompt = `
        다음 뉴스 기사를 바탕으로 사용자들의 참여를 유도하는 흥미진진한 "VS 밸런스 게임"을 만들어주세요.
        사용자가 A와 B 중 하나를 선택해야 하며, 딜레마적이거나 논쟁적인 요소가 있어야 합니다.
        가급적 정치/사회적 이슈는 중립적이면서도 날카로운 양자택일을 유도하세요.
        연예/생활 이슈는 팬덤 대결이나 가치관 대결로 구성하세요.

        기사 내용:
        ${contentStr.substring(0, 3000)}

        JSON 응답 형식:
        {
            "title": "질문 제목 (25자 이내, 물음표로 끝내기)",
            "category": "POLITICS, ENTERTAINMENT, SOCIAL 중 택1",
            "option_a": { "text": "선택지 A (8자 이내)", "emoji": "이모지(하나만)", "keyword": "핵심단어" },
            "option_b": { "text": "선택지 B (8자 이내)", "emoji": "이모지(하나만)", "keyword": "핵심단어" }
        }
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an expert game content creator specializing in viral balance games." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.8
        });

        const result = JSON.parse(response.choices[0].message.content || "{}");

        if (!result.title || !result.option_a || !result.option_b) {
            console.error("[BalanceGame] Invalid AI response structure", result);
            return;
        }

        // 3. Save to DB
        // Determine source title roughly or leave blank
        const game = await storage.createBalanceGame({
            title: result.title,
            category: result.category || 'SOCIAL',
            optionA: result.option_a,
            optionB: result.option_b,
            sourceNewsUrl: url,
            sourceNewsTitle: "AI Generated based on Trend",
            status: 'ACTIVE', // Auto-approve per user request
            countA: 0,
            countB: 0
        });

        console.log(`[BalanceGame] Generated ACTIVE Game: ID ${game.id} - ${game.title}`);
        return game;

    } catch (e) {
        console.error("[BalanceGame] Generation Error:", e);
    }
}
